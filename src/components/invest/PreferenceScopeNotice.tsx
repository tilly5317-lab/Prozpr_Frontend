import type { ScreenPreferenceGetResponse } from "@/lib/api";

export type CarveOutKey = NonNullable<ScreenPreferenceGetResponse["carve_outs_at_risk"]>[number];

/** The planning Prozpr genuinely stops doing once a customer owns the whole
 *  distribution. Only the keys the backend flags are shown, each a measured
 *  consequence (backend spec 3.3-3.4) — three separate facts with three separate
 *  triggers, so a leveraged customer with no emergency-fund need is told about
 *  the liability offset and nothing else.
 *
 *  `near_term_goals` still arrives on the wire and is deliberately not listed:
 *  a saved split does not stop us planning for a goal, it only changes what the
 *  plan is built around, and saying otherwise overstated it. */
const CARVE_OUTS: { key: CarveOutKey; lead: string; body: string }[] = [
  {
    key: "emergency_fund",
    lead: "No separate emergency fund.",
    body: "We'd normally hold a reserve back before investing the rest. With your split, all of it follows your percentages.",
  },
  {
    key: "liability_offset",
    lead: "We stop offsetting your loans.",
    body: "You owe more than you hold, so we currently keep some money in short-term debt to cover that. That stops.",
  },
];

/**
 * What a saved distribution does and does not change, shown before the customer
 * commits. Unlike the warning it replaced, this ALWAYS renders: it carries the
 * directional-target promise, which is true of every saved split, and would
 * otherwise vanish on the (current) backends that send no carve-out keys.
 *
 * The bullets are the pre-commit warning. They are NOT the post-save
 * `shortfall_reason` the resulting plan carries — same fact, two places.
 */
export default function PreferenceScopeNotice({ keys }: { keys: CarveOutKey[] }) {
  const shown = CARVE_OUTS.filter((co) => keys.includes(co.key));

  return (
    <div className="mx-5 mt-4 rounded-2xl border border-[hsl(var(--wealth-amber))] bg-[hsl(var(--wealth-amber-light))] p-4">
      <p className="text-[12.5px] font-semibold leading-snug text-foreground">
        {"You set the split. We still pick the funds."}
      </p>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
        {"Your preference replaces the allocation we'd have chosen for you. Which funds go into each slot, and when to switch them, stays with us."}
      </p>

      {shown.length > 0 ? (
        <ul className="mt-2.5 space-y-1.5 border-t border-[hsl(var(--wealth-amber))]/35 pt-2.5">
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
      ) : null}

      <p className="mt-2.5 border-t border-[hsl(var(--wealth-amber))]/35 pt-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
        {"This is a directional target — we'll get as close to it as we can, and the exact split can move slightly when we fit real funds. You can clear your preference any time."}
      </p>
    </div>
  );
}
