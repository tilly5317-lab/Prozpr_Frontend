import type { ReactNode } from "react";

// Today and Prozpr are each just wide enough for "100%" and for their header,
// and the gaps are tight, so a name as long as "Commodity" stays on one line
// on a 360px phone. You is exactly a PercentStepper, in its own units — two
// 2rem buttons, the 2.5rem figure and a 1px border either side — so a plain
// figure there (gold, the fund's part) sits over the steppers' figures, and
// every group's columns line up on the page.
const COLUMNS = {
  today: "grid-cols-[minmax(0,1fr)_2.25rem_2.25rem_calc(6.5rem_+_2px)]",
  noToday: "grid-cols-[minmax(0,1fr)_2.25rem_calc(6.5rem_+_2px)]",
};
const HEAD = "text-right text-[11px] text-muted-foreground";

/**
 * Today · Prozpr · You as columns under one header, so each figure is printed
 * once and read across its row. With no holdings there is no Today column at
 * all. The rows are `FigureRow`s, or any cells that fill the same columns.
 */
export default function FigureTable({
  showToday,
  className = "",
  children,
}: {
  showToday: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid items-center gap-x-1 gap-y-3 ${showToday ? COLUMNS.today : COLUMNS.noToday} ${className}`}
    >
      {/* Only for the eye: Today's and Prozpr's figures name their own column
          to a screen reader. */}
      <div aria-hidden className="contents">
        <span />
        {showToday ? <span className={HEAD}>Today</span> : null}
        <span className={HEAD}>Prozpr</span>
        <span className="text-center text-[11px] font-semibold text-foreground">You</span>
      </div>
      {children}
    </div>
  );
}

/** A row's name, today's and Prozpr's figures, then the customer's own.
 *  `today` is null exactly when the table has no Today column. */
export function FigureRow({
  testId,
  name,
  today,
  prozpr,
  you,
}: {
  testId?: string;
  name: ReactNode;
  today: number | null;
  prozpr: number;
  you: ReactNode;
}) {
  return (
    <div data-testid={testId} className="contents">
      {/* Narrower than 360px a long name breaks inside its column rather than
          running over the figures beside it. */}
      <div className="min-w-0 [overflow-wrap:anywhere]">{name}</div>
      {today !== null ? <Figure column="Today" value={today} /> : null}
      <Figure column="Prozpr" value={prozpr} />
      {you}
    </div>
  );
}

function Figure({ column, value }: { column: string; value: number }) {
  return (
    <span className="text-right text-[13px] tabular-nums text-muted-foreground">
      <span className="sr-only">{`${column} `}</span>
      {`${value}%`}
    </span>
  );
}
