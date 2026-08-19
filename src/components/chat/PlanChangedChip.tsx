import { useState } from "react";
import { Check, Undo2, Target, Trash2 } from "lucide-react";
import type { SavedGoal, SavedPlanField } from "@/lib/api";

/**
 * Confirmation that something in the user's plan changed, with a way back out.
 *
 * The undo is the point. Writing a financial input — or a goal — from a parsed
 * chat message is only defensible if the user can see exactly what landed and
 * reverse it in one tap. The backend keeps the previous value (for a goal, the
 * whole row) on the audit row precisely so this button never has to guess.
 *
 * `basis` is shown whenever a value was worked out from one we already held:
 * the user said "up 20%", and seeing "20% increase on the ₹30,00,000 on file"
 * is how they catch it if we applied their change to the wrong number.
 */

interface Props {
  saved?: SavedPlanField[] | null;
  goalSaved?: SavedGoal | null;
  goalRemoved?: { goal: string }[] | null;
  onUndo: () => Promise<void> | void;
}

const PlanChangedChip = ({ saved, goalSaved, goalRemoved, onUndo }: Props) => {
  const [state, setState] = useState<"idle" | "undoing" | "undone">("idle");

  const fields = saved ?? [];
  const removed = goalRemoved ?? [];
  if (!fields.length && !goalSaved && !removed.length) return null;

  const handleUndo = async () => {
    if (state !== "idle") return;
    setState("undoing");
    try {
      await onUndo();
      setState("undone");
    } catch {
      setState("idle");
    }
  };

  const headline = state === "undone" ? "Change reversed" : "Saved to your plan";

  return (
    <div className="ml-7 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Check className="h-3.5 w-3.5 text-primary" />
        {headline}
      </span>

      {state !== "undone" ? (
        <>
          {fields.map((field) => (
            <span
              key={field.field_key}
              title={field.basis ?? undefined}
              className="rounded-md border border-border/70 bg-muted/30 px-2 py-0.5 text-[11.5px] text-foreground/85"
            >
              {field.label}: <span className="font-medium">{field.display_value}</span>
              {field.basis ? (
                <span className="ml-1 text-muted-foreground">({field.basis})</span>
              ) : null}
            </span>
          ))}

          {goalSaved ? (
            <span className="flex items-center gap-1 rounded-md border border-border/70 bg-muted/30 px-2 py-0.5 text-[11.5px] text-foreground/85">
              <Target className="h-3 w-3 text-primary" />
              <span className="font-medium">{goalSaved.goal}</span>
              {goalSaved.you_need_to_save ? (
                <span className="text-muted-foreground">
                  · {goalSaved.you_need_to_save}
                </span>
              ) : null}
            </span>
          ) : null}

          {removed.map((g) => (
            <span
              key={g.goal}
              className="flex items-center gap-1 rounded-md border border-border/70 bg-muted/30 px-2 py-0.5 text-[11.5px] text-foreground/85"
            >
              <Trash2 className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">{g.goal}</span>
              <span className="text-muted-foreground">removed</span>
            </span>
          ))}
        </>
      ) : null}

      {state === "idle" ? (
        <button
          type="button"
          onClick={handleUndo}
          className="flex items-center gap-1 text-[11.5px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          <Undo2 className="h-3 w-3" />
          Undo
        </button>
      ) : null}
    </div>
  );
};

export default PlanChangedChip;
