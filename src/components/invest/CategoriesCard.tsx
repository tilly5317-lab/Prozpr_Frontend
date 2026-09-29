import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import InfoPopup, { DIRECTIONAL_TARGET, PopupText } from "@/components/invest/InfoPopup";
import type { Cls } from "@/lib/investment-preferences";

/** The groups the Categories card opens. */
export type Editor = "multi-asset" | Cls;

type Tone = "prozpr" | "own" | "warn";
const TONE: Record<Tone, string> = {
  prozpr: "text-muted-foreground",
  own: "font-semibold text-wealth-amber",
  warn: "font-semibold text-[hsl(var(--warning))]",
};

/**
 * The main page's categories as dropdowns: one row per group, saying whether it
 * is still Prozpr's recommendation or the customer's preference, with the open
 * group's controls right under its row. The page decides which group is open —
 * one at a time — so the customer never leaves the screen to change one.
 */
export default function CategoriesCard({
  mine,
  unbalanced,
  open,
  onToggle,
  renderPanel,
}: {
  /** Which rows differ from Prozpr's numbers. */
  mine: { multiAsset: boolean; equity: boolean; debt: boolean; others: boolean };
  /** Groups whose categories don't add up yet — Save waits on these. */
  unbalanced: Cls[];
  open: Editor | null;
  onToggle: (e: Editor) => void;
  /** The open group's controls. */
  renderPanel: (e: Editor) => ReactNode;
}) {
  const pick = (own: boolean) => (own ? "Your preference" : "Prozpr's recommendation");
  const group = (to: Cls, title: string) =>
    unbalanced.includes(to)
      ? { to, title, status: "Doesn't add up", tone: "warn" as Tone }
      : { to, title, status: pick(mine[to]), tone: (mine[to] ? "own" : "prozpr") as Tone };
  const rows: { to: Editor; title: string; status: string; tone: Tone }[] = [
    {
      to: "multi-asset",
      title: "Multi-asset funds",
      status: pick(mine.multiAsset),
      tone: mine.multiAsset ? "own" : "prozpr",
    },
    group("equity", "Equity categories"),
    group("debt", "Debt categories"),
    group("others", "Commodity categories"),
  ];

  return (
    <section className="mx-5 mt-4 rounded-2xl border border-border bg-card px-4 pt-4">
      <div className="flex items-center">
        <h2 className="text-[15px] font-semibold text-foreground">Categories</h2>
        <InfoPopup
          label="About categories"
          title="Categories"
          lead="We pick these to match your mix. Tap one to set your own."
        >
          <PopupText>{DIRECTIONAL_TARGET}</PopupText>
        </InfoPopup>
      </div>
      <ul className="mt-1 divide-y divide-border">
        {rows.map((r) => {
          const isOpen = open === r.to;
          const panelId = `group-${r.to}`;
          return (
            <li key={r.to}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={isOpen ? panelId : undefined}
                onClick={() => onToggle(r.to)}
                // Open, the row is only its title, so it needs no more than a
                // 44px target; closed it carries the status line too.
                className={`flex w-full items-center gap-3 py-2 text-left ${isOpen ? "min-h-[44px]" : "min-h-[52px]"}`}
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-foreground">{r.title}</span>
                  {/* Open, the group below already shows where it stands. */}
                  {isOpen ? null : <span className={`mt-0.5 block text-[12px] ${TONE[r.tone]}`}>{r.status}</span>}
                </span>
                <ChevronDown
                  className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {isOpen ? (
                <div id={panelId} className="pb-3">
                  {renderPanel(r.to)}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
