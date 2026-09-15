import type { ScreenPreferenceGetResponse } from "@/lib/api";

export type CarveOutKey = NonNullable<ScreenPreferenceGetResponse["carve_outs_at_risk"]>[number];

/** The planning Prozpr stops doing once a customer owns the whole distribution.
 *  Listed in the order the notice reads; only the keys the backend flags are
 *  shown. Each line is a measured consequence (backend spec 3.3-3.4), not a
 *  paraphrase — do not re-word. Three separate facts with three separate
 *  triggers: a leveraged customer with no emergency-fund need should be told
 *  about the liability offset and nothing else. */
const CARVE_OUTS: { key: CarveOutKey; lead: string; body: string }[] = [
  {
    key: "emergency_fund",
    lead: "No separate emergency fund.",
    body: "We'd normally hold a reserve back before investing the rest. We won't — all of it follows your split.",
  },
  {
    key: "near_term_goals",
    lead: "Goals in the next five years stop being planned for.",
    body: "They stay on your record, but your plan gets built around your split, not around their dates.",
  },
  {
    key: "liability_offset",
    lead: "We'll stop offsetting your loans.",
    body: "You owe more than you hold, so we currently keep some money in short-term debt to cover that. That stops.",
  },
];

/**
 * What a saved distribution switches off, shown before the customer commits so
 * they can still change their mind. Renders nothing when `keys` is empty — which
 * is the state until the backend sends `carve_outs_at_risk` (backend spec 9.1),
 * and the right degradation: silence rather than a warning shown to customers it
 * does not apply to.
 *
 * This is the pre-commit warning. It is NOT the post-save `shortfall_reason`
 * disclosure the resulting plan carries — same fact, two places, both wanted.
 */
export default function CarveOutNotice({ keys }: { keys: CarveOutKey[] }) {
  const shown = CARVE_OUTS.filter((co) => keys.includes(co.key));
  if (shown.length === 0) return null;

  return (
    <div className="mx-5 mt-4 rounded-2xl border border-[hsl(var(--wealth-amber))] bg-[hsl(var(--wealth-amber-light))] p-3">
      <p className="text-[11.5px] font-semibold leading-snug text-foreground">
        {"You're replacing our planning, not just our fund picks"}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {"You're telling us where your whole portfolio should sit, so we'll stop making these calls for you:"}
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {shown.map((co) => (
          <li key={co.key} className="flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <span aria-hidden className="text-[hsl(var(--wealth-amber))]">
              &bull;
            </span>
            <span>
              <strong className="font-semibold text-foreground">{co.lead}</strong> {co.body}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {"You can clear your preference any time and we'll go back to planning it for you."}
      </p>
    </div>
  );
}
