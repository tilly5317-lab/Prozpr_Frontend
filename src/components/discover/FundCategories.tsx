import { motion } from "framer-motion";

import type { FundGroup } from "@/lib/fundGroups";

/**
 * A theme as a circular icon with its label beneath — the browse affordance
 * that reads as "pick a world you care about" rather than "apply a filter".
 * Sized for a 4-across grid on a 360px phone.
 */
export function ThemeCircle({
  group,
  onOpen,
  index = 0,
}: {
  group: FundGroup;
  onOpen: () => void;
  /** Staggers the entrance so the row assembles rather than popping in. */
  index?: number;
}) {
  const Icon = group.icon;
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, delay: Math.min(index, 8) * 0.04, ease: [0.16, 1, 0.3, 1] }}
      className="group flex min-w-0 flex-col items-center gap-1.5 text-center"
      aria-label={`${group.label} funds — ${group.blurb}`}
    >
      <span
        className={`flex h-[52px] w-[52px] items-center justify-center rounded-full transition-transform group-hover:scale-105 group-active:scale-95 ${group.tint}`}
      >
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <span className="w-full min-w-0">
        <span className="block truncate text-[10.5px] font-semibold leading-tight text-foreground">
          {group.label}
        </span>
        {group.count != null && (
          <span className="block text-[9.5px] leading-tight tabular-nums text-muted-foreground/70">
            {group.count} {group.count === 1 ? "fund" : "funds"}
          </span>
        )}
      </span>
    </motion.button>
  );
}

/** Row-style tile — used where the gloss matters more than a compact icon. */
export function CategoryTile({
  group,
  onOpen,
  compact = false,
}: {
  group: FundGroup;
  onOpen: () => void;
  compact?: boolean;
}) {
  const Icon = group.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-2.5 text-left transition-all hover:shadow-sm active:scale-[0.98]"
    >
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${group.tint}`}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-[12px] font-semibold text-foreground">{group.label}</span>
          {group.count != null && (
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
              {group.count}
            </span>
          )}
        </span>
        {!compact && (
          <span className="mt-0.5 block text-[10.5px] leading-snug text-muted-foreground">
            {group.blurb}
          </span>
        )}
      </span>
    </button>
  );
}
