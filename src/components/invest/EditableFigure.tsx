import { useEffect, useRef, useState } from "react";

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
 * The number in the middle of a stepper, which the customer can tap to type
 * over: 32px to look at, 44px tall to tap, in the standard text colour.
 *
 * The field clamps to `max` on every keystroke, so an out-of-range figure is
 * never displayable. That is the whole point: a value rejected at commit and
 * replaced in the same frame is indistinguishable from the app ignoring you.
 *
 * At rest its accessible name carries the value ("Large-cap percentage, 11%"):
 * the name replaces the visible text, and a figure a screen reader cannot hear
 * is no figure at all.
 *
 * `select-none` also suppresses iOS's selection callout. `touch-manipulation`
 * and `-webkit-touch-callout` are not needed: this app's viewport already
 * disables double-tap zoom, and neither appears anywhere else in `src/`.
 *
 * The caller still owns what a new value means — this only reports one in range.
 */
export default function EditableFigure({
  value,
  max,
  label,
  onCommit,
}: {
  value: number;
  max: number;
  label: string;
  onCommit: (v: number) => void;
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
    // An unchanged value must not commit: it would engage the customer's own
    // numbers — turning "engine decides" into a pin — with no edit.
    if (commit && draft !== "" && Number(draft) !== value) onCommit(Number(draft));
    setDraft(null);
  };

  const look =
    "h-8 w-10 rounded text-center text-[14px] font-semibold tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A868]/50";

  if (draft !== null) {
    return (
      <input
        autoFocus
        // type="number" brings spinners and a locale-dependent separator into a
        // 40px cell; the parse in `finish` is the only validation needed.
        type="text"
        inputMode="numeric"
        aria-label={`${label} percentage`}
        value={draft}
        onChange={(e) => {
          const sanitised = sanitiseDigits(e.target.value);
          setDraft(Number(sanitised) > max ? String(max) : sanitised);
        }}
        onFocus={(e) => e.target.select()}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== "Escape") return;
          e.preventDefault();
          byKey.current = true;
          finish(e.key === "Enter");
        }}
        className={`bg-muted ${look}`}
      />
    );
  }

  return (
    <button
      ref={restRef}
      type="button"
      aria-label={`${label} percentage, ${value}%`}
      title="Tap to type a value"
      onClick={() => setDraft(String(value))}
      // 32px to see, 44px tall to tap: the ::after pad reaches past the box.
      className={`relative select-none bg-transparent after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] ${look}`}
    >
      {`${value}%`}
    </button>
  );
}
