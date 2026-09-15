import { useState, type ChangeEvent } from "react";

import { round1 } from "@/lib/investment-preferences";

/** Blank stays blank. An empty field is `null` — a deliberate "nothing here" —
 *  never 0, which would read as a real entry (spec §4.3). */
const parse = (raw: string): number | null => {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

/** One percentage field. It owns the raw keystrokes between focus and blur so the
 *  grid rule can wait: typing "2" on the way to "25" must not be clamped or
 *  snapped under the customer. On blur the value is clamped to 0-100 and snapped
 *  with `round1` — the snap is load-bearing, because `toSavePins` sends row values
 *  to the wire verbatim while validation rounds the class sum. */
export default function PctInput({
  label, value, onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? "" : String(value));

  return (
    <input
      // `type="text"`, not `"number"`: a number input reports "" for a
      // half-typed "7.", which would wipe the field the moment the customer
      // types the decimal point. `inputMode` still brings up the numeric keypad.
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={shown}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        setDraft(e.target.value);
        onChange(parse(e.target.value));
      }}
      onBlur={() => {
        if (draft === null) return;
        const n = parse(draft);
        setDraft(null);
        onChange(n === null ? null : round1(Math.min(100, Math.max(0, n))));
      }}
      className="w-[84px] rounded-lg border border-input bg-background px-2.5 py-2 text-right text-[13.5px] tabular-nums text-foreground"
    />
  );
}
