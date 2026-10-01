/* How many goals the plan's corpus actually covers in the year each one falls
   due — the "…reaches 3 of your 5 goals" line under the SIP stat.

   Measured against the ENGINE's year-by-year corpus, so it describes the SIP
   the projection ran on, not whatever is typed into the SIP box. */

export type LandingGoal = {
  id: string;
  /** Calendar year the goal falls due. */
  year: number;
  /** Inflated cost in that year. */
  futureValue: number;
  priority: "Low" | "Medium" | "High";
};

export type LandingCorpusRow = {
  /** Corpus left at the end of the year, after that year's goal payouts. */
  corpusClosing: number;
  /** What the engine paid out towards goals that year. */
  goalPayout: number;
};

export type GoalLanding = {
  /** Goals the corpus fully covers when they fall due. */
  reached: number;
  /** Goals inside the projection's range, reached or not. */
  counted: number;
  /** Goals beyond the projection's last year — not counted either way. */
  unknown: number;
  /** Per counted goal: rupees the corpus is short of it when it falls due (0 = covered). */
  shortfallById: Map<string, number>;
};

const PRIORITY_RANK: Record<LandingGoal["priority"], number> = { High: 0, Medium: 1, Low: 2 };

export function goalLanding(
  goals: LandingGoal[],
  corpusByYear: Map<number, LandingCorpusRow> | null,
): GoalLanding {
  if (!corpusByYear || corpusByYear.size === 0) {
    return { reached: 0, counted: 0, unknown: goals.length, shortfallById: new Map() };
  }

  // Goals sharing a year draw on the same pot, so fund them in priority order.
  const byYear = new Map<number, LandingGoal[]>();
  let unknown = 0;
  for (const g of goals) {
    if (!corpusByYear.has(g.year)) {
      unknown += 1;
      continue;
    }
    const list = byYear.get(g.year) ?? [];
    list.push(g);
    byYear.set(g.year, list);
  }

  let reached = 0;
  let counted = 0;
  const shortfallById = new Map<string, number>();
  for (const [year, list] of byYear) {
    const row = corpusByYear.get(year)!;
    // What was there to spend that year: the closing corpus plus what was paid out.
    let available = Math.max(0, (row.corpusClosing || 0) + (row.goalPayout || 0));
    list.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    for (const g of list) {
      counted += 1;
      if (available >= g.futureValue) {
        reached += 1;
        available -= g.futureValue;
        shortfallById.set(g.id, 0);
      } else {
        shortfallById.set(g.id, g.futureValue - available);
        available = 0;
      }
    }
  }

  return { reached, counted, unknown, shortfallById };
}

/** The sentence under the SIP stat. Null when there is nothing to count. */
export function landingBlurb(landing: GoalLanding): string | null {
  const { reached, counted } = landing;
  if (counted === 0) return null;
  if (reached === counted) {
    return counted === 1 ? "your plan reaches your goal." : `your plan reaches all ${counted} of your goals.`;
  }
  if (reached === 0) {
    return counted === 1 ? "your plan falls short of your goal." : `your plan falls short of all ${counted} of your goals.`;
  }
  return `your plan reaches ${reached} of your ${counted} goals.`;
}
