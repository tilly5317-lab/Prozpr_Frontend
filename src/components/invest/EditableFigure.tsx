import { useEffect, useRef, useState } from "react";

import { roundPct } from "@/lib/investment-preferences";

// The customer can paste or hold a key down, so anything can land in the
// field in one event. Truncating rather than rejecting matters: a field that
// stops responding to a keystroke reads as broken, not as validating.
function sanitiseDigits(raw: string): string {
  // Whole percents are this screen's unit of precision, so only digits survive
  // to reach `finish` — a sign, a letter, an exponent character (Number("1e3")
  // is 1000, not the "13" a customer pressed) or a decimal point is dropped.
  return raw.replace(/[^0-9]/g, "");
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
    const n = roundPct(Number(draft));
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
        inputMode="numeric"
        aria-label={`${label} share`}
        value={draft}
        onChange={(e) => {
          const sanitised = sanitiseDigits(e.target.value);
          const n = Number(sanitised);
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
      onClick={() => setDraft(value.toFixed(0))}
      className={`select-none rounded bg-foreground/[0.04] px-1 py-1 text-right font-semibold tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A868]/50 ${className}`}
    >
      {`${value.toFixed(0)}%`}
    </button>
  );
}
