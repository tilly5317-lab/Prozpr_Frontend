/**
 * Compliance footer for the fund page.
 *
 * Educational, not advice — and it says so in those words. The page carries
 * verdict language ("top quartile", "lower is better") that reads as a
 * recommendation if nothing on the page draws the line, so the line is drawn
 * here explicitly rather than left to the reader.
 */
export function FundDisclaimer({ asOf }: { asOf?: string | null }) {
  return (
    <div className="px-3 pb-2 pt-1 text-center">
      <p className="text-[12px] font-semibold text-[hsl(var(--wealth-blue))]">
        Prozpr
      </p>
      <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground/80">
        Educational only — not investment advice. Prozpr is not a SEBI-registered investment
        adviser.
        {asOf && (
          <>
            <br />
            Figures as of {asOf}.
          </>
        )}
        <br />
        Past performance does not predict future returns. Mutual fund investments are subject to
        market risks.
      </p>
    </div>
  );
}

export default FundDisclaimer;
