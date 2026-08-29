/**
 * Every term on the fund page that deserves an explanation.
 *
 * Two fields, deliberately: `what` defines the term, `impact` says what a higher
 * or lower number actually does to the reader. A definition alone leaves the
 * reader knowing what a Sortino ratio *is* and no better placed to judge one.
 *
 * Voice: plain-spoken, warm, a little dry. Explains, never advises — the page
 * carries a compliance footer saying exactly that, and this copy has to hold
 * the same line.
 */

export interface GlossaryEntry {
  /** Display title on the tooltip. */
  t: string;
  /** What the term means. */
  what: string;
  /** What a higher or lower value does to the investor. */
  impact: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  nav: {
    t: "NAV",
    what: "The price of one unit of the fund, worked out fresh at the end of every trading day.",
    impact:
      "A high NAV isn't expensive and a low one isn't cheap. It only tells you how the fund has been sliced into units — ₹10,000 buys the same slice of the same portfolio either way.",
  },
  aum: {
    t: "AUM (fund size)",
    what: "The total pile of money the fund is managing right now.",
    impact:
      "Bigger is easier to enter and exit. But a very large fund can struggle to build a meaningful position in a smaller company without pushing the price up on itself.",
  },
  expense: {
    t: "Expense ratio",
    what: "The slice the fund keeps each year for running itself — salaries, research, paperwork.",
    impact:
      "It comes out whether the fund has a good year or a terrible one. Lower means more of whatever the fund earns stays with you, and the gap compounds quietly over a long holding.",
  },
  exitload: {
    t: "Exit load",
    what: "A fee the fund charges if you redeem before a set date.",
    impact:
      "It's a toll on leaving early, not a permanent charge. Once the holding period is past, it stops applying entirely.",
  },
  lockin: {
    t: "Lock-in period",
    what: "A stretch where the units simply cannot be redeemed, at any price.",
    impact:
      "ELSS funds carry three years by law. “None” means your money isn't trapped — though an exit load may still apply.",
  },
  direct: {
    t: "Direct vs Regular",
    what: "Direct plans skip the distributor. Regular plans pay one, out of your returns.",
    impact:
      "Same portfolio, same manager, same everything — except the expense ratio. The difference shows up in the NAV, year after year.",
  },
  growthopt: {
    t: "Growth vs IDCW",
    what: "Growth leaves every gain inside the fund. IDCW pays some of it out to you.",
    impact:
      "Growth keeps the whole amount compounding. IDCW hands you cash, but the NAV drops by exactly what was paid out — it isn't free money.",
  },
  sip: {
    t: "SIP",
    what: "A fixed amount invested automatically on the same date each month.",
    impact:
      "It spreads your entry across many different prices instead of one. Nobody has to be clever about picking the right day.",
  },
  lumpsum: {
    t: "Lumpsum",
    what: "One amount, invested in one go.",
    impact:
      "The whole sum starts working immediately — and the whole sum is exposed to whatever the market does next week.",
  },
  units: {
    t: "Units",
    what: "Your slice of the fund: money invested divided by that day's NAV.",
    impact: "The unit count stays put once bought. What moves is what each unit is worth.",
  },
  avgnav: {
    t: "Average NAV",
    what: "The average price you actually paid, across every instalment you've made.",
    impact:
      "Set it against today's NAV and you can see the distance your money has travelled — and how much of that is price versus how much is fresh money.",
  },
  xirr: {
    t: "XIRR",
    what: "Your real annualised return, accounting for the fact that every instalment has been invested for a different length of time.",
    impact:
      "It's the honest number for a lumpy investing history. A plain “total gain %” would flatter or punish you purely based on when you happened to put money in.",
  },
  riskometer: {
    t: "Riskometer",
    what: "SEBI's mandatory six-step label for how risky the scheme's actual portfolio is.",
    impact:
      "It describes the portfolio, not you. Equity funds sit near the top end almost by definition — the label is a fact about the holdings, not a verdict on whether it suits you.",
  },
  ltcg: {
    t: "Long-term capital gains",
    what: "Gains on units you've held for more than 12 months.",
    impact:
      "Taxed at 12.5%, and only above ₹1.25 lakh of gains in a financial year. Crossing the 12-month mark moves a gain from the higher short-term rate to this one.",
  },
  stcg: {
    t: "Short-term capital gains",
    what: "Gains on units held for 12 months or less.",
    impact:
      "Taxed at 20% with no exemption — the costlier of the two rates. Selling early can cost you more in tax than the extra return was worth.",
  },
  benchmark: {
    t: "Benchmark",
    what: "The index the fund has publicly promised to measure itself against.",
    impact:
      "Beating it is the entire job. Trailing it means the active fee bought you less than the index managed on its own.",
  },
  catavg: {
    t: "Category average",
    what: "The average across every fund playing by the same SEBI rulebook.",
    impact:
      "It's the fair yardstick. Comparing a small-cap fund against a large-cap one tells you about the market that year, not about the manager.",
  },
  sebicat: {
    t: "SEBI category",
    what: "SEBI's fixed definition of what each fund type must and must not hold.",
    impact:
      "It's what makes comparison honest — every flexi cap fund is working within the same constraints, so the differences are down to the people running them.",
  },
  indexfund: {
    t: "Index fund",
    what: "A fund that simply copies an index instead of picking anything.",
    impact:
      "It's the low-cost yardstick every active fund is implicitly asking to be judged against — cheap, predictable, and never better or worse than the index by much.",
  },
  cagr: {
    t: "CAGR",
    what: "The steady yearly rate that would have taken you from the starting value to today's.",
    impact:
      "It irons the lumpy years flat into one number. Useful for comparing, but no actual year ever looks like the CAGR.",
  },
  rolling: {
    t: "3-year rolling returns",
    what: "Every possible three-year stretch, not just the most recent one.",
    impact:
      "It strips out the luck of your start date. A fund that holds up on rolling numbers didn't simply catch one good run at the right moment.",
  },
  alpha: {
    t: "Alpha",
    what: "The part of the return the manager added that the market's own movement doesn't explain.",
    impact:
      "Above zero, something was genuinely added. Below zero, the market did the work and the fund still charged you for the privilege.",
  },
  percentile: {
    t: "Percentile",
    what: "Where the fund sits out of 100 comparable funds.",
    impact:
      "12 means it beat 88 of them, so lower is better. A fund that stays low across several periods has been consistent rather than lucky once.",
  },
  quartile: {
    t: "Quartile",
    what: "The category cut into four equal groups by performance.",
    impact:
      "Top quartile is the best 25%. One top-quartile year is noise — how often a fund lands there is the part worth reading.",
  },
  rank: {
    t: "Rank in category",
    what: "The fund's exact position among every fund it competes with.",
    impact:
      "4 of 24 and 4 of 240 are very different achievements. The size of the field matters as much as the number in front of it.",
  },
  consistency: {
    t: "Consistency",
    what: "How often the fund actually landed in the top quarter of its category.",
    impact:
      "One spectacular year can carry a decade of averages. This asks the harder question: how often did it turn up?",
  },
  pe: {
    t: "P/E (TTM)",
    what: "What you're paying for ₹1 of the underlying companies' yearly profit.",
    impact:
      "Lower means you're paying less for the same earnings. A high number means a lot of good news is already priced in, which leaves less room for pleasant surprises.",
  },
  pb: {
    t: "P/B (TTM)",
    what: "What you're paying for ₹1 of the companies' net assets, as the books record them.",
    impact:
      "Lower looks cheaper. Very low can also mean the market quietly doubts those assets are worth what the books claim.",
  },
  ps: {
    t: "P/S (TTM)",
    what: "What you're paying for ₹1 of the companies' sales.",
    impact:
      "Sales are steadier than profits, so this is handy when earnings swing about. Lower is cheaper, on the same logic as P/E.",
  },
  dy: {
    t: "Dividend yield",
    what: "The dividends the holdings are expected to pay, as a share of their price.",
    impact:
      "Higher means more of the return arrives as cash rather than as price movement. Growth-heavy portfolios usually run low here — that's a style, not a flaw.",
  },
  mdd: {
    t: "Max drawdown",
    what: "The worst peak-to-bottom fall the fund has taken before recovering.",
    impact:
      "A shallower fall is easier to sit through. Deep drawdowns are where people bail out at the worst possible moment and lock the loss in.",
  },
  mean3: {
    t: "3-year mean return",
    what: "The average yearly return over the last three years, boiled down to one figure.",
    impact:
      "Higher is more return — but it says nothing about how bumpy the ride was. That's what Sharpe and Sortino are for.",
  },
  sharpe: {
    t: "Sharpe ratio",
    what: "How much return the fund earned for each unit of bumpiness along the way.",
    impact:
      "Higher means the same return arrived with a calmer ride. Lower means you paid for that return in nerves.",
  },
  sortino: {
    t: "Sortino ratio",
    what: "Sharpe's stricter cousin — it only counts the falls, since nobody complains about volatility on the way up.",
    impact:
      "Higher means fewer of the drops that actually hurt. It's the more honest measure if what you mind is losing money, not moving money.",
  },
  ir: {
    t: "Information ratio",
    what: "How reliably the fund beats its benchmark, not merely by how much.",
    impact:
      "Higher means the outperformance turns up year after year. Near zero means it was mostly one good roll of the dice.",
  },
  te: {
    t: "Tracking error",
    what: "How far the fund wanders from its benchmark, in either direction.",
    impact:
      "Low means it hugs the index closely. High means the manager is taking real, distinct bets — which is what produces both the great years and the ugly ones.",
  },
  volatility: {
    t: "Volatility",
    what: "How much the fund's value swings around over a year.",
    impact:
      "Higher means bigger moves in both directions. It says nothing about which way — only how eventful the journey is likely to feel.",
  },
  mcap: {
    t: "Market cap",
    what: "Large caps are India's top 100 listed companies, mid caps the next 150, small caps everything after.",
    impact:
      "Smaller companies can grow faster and fall harder. The mix here is the single best clue to how bumpy the fund is likely to feel.",
  },
  sector: {
    t: "Sector allocation",
    what: "Which industries the fund's equity is actually spread across.",
    impact:
      "Two funds holding the same sectors in the same weights tend to move together. They add far less variety to a portfolio than their different names suggest.",
  },
  credit: {
    t: "Credit rating",
    what: "How likely a bond issuer is to pay you back, graded by rating agencies.",
    impact:
      "AAA is the safest and pays the least. Lower grades pay more precisely because there's a real chance they don't pay at all.",
  },
  concentration: {
    t: "Concentration",
    what: "How much of the portfolio sits in its largest holdings.",
    impact:
      "Highly concentrated means the manager's best ideas genuinely move the needle. Spread thin means the fund will behave a lot like the index it's benchmarked to.",
  },
  fundage: {
    t: "Age of fund",
    what: "How long this scheme has actually existed.",
    impact:
      "An older fund has been tested through more kinds of weather, crashes included. A short history has only ever seen the climate it was born into.",
  },
  pmtenure: {
    t: "Manager tenure",
    what: "How long the current manager has personally run this fund.",
    impact:
      "A track record belongs to the person who built it. A recently arrived manager means the impressive numbers above them are somebody else's work.",
  },
};

export type GlossaryTerm = keyof typeof GLOSSARY;
